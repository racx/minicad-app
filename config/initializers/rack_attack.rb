# frozen_string_literal: true

# AI endpoint guardrails. Rack::Attack is appended to the middleware stack
# (after session + warden), so the signed-in user is available for keying.
Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new unless Rails.env.production?

Rack::Attack.throttle("ai_commands/user", limit: 10, period: 1.minute) do |req|
  if req.post? && req.path.match?(%r{\A/api/drawings/\d+/ai_commands\z})
    req.env["warden"]&.user&.id || req.ip
  end
end

Rack::Attack.throttled_responder = lambda do |_req|
  [ 429,
    { "Content-Type" => "application/json" },
    [ { status: "limit", plan: nil, script: nil,
        question: "Too many AI requests — wait a minute and try again." }.to_json ] ]
end

# Off in test by default; the throttle test enables it explicitly.
Rack::Attack.enabled = false if Rails.env.test?
