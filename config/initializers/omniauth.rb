# frozen_string_literal: true

# Configure OmniAuth CSRF protection using built-in AuthenticityTokenProtection
# This replaces the omniauth-rails_csrf_protection gem which is no longer needed
# since OmniAuth 2.x includes built-in CSRF protection.
#
# The key :_csrf_token is where Rails stores the CSRF token in the session by default.
#
# References:
# - https://github.com/omniauth/omniauth/issues/960#issuecomment-758194841
# - https://github.com/cookpad/omniauth-rails_csrf_protection/pull/24
Rails.application.config.to_prepare do
  OmniAuth.configure do |c|
    c.logger = Rails.logger
    c.request_validation_phase = OmniAuth::AuthenticityTokenProtection.new(
      key: :_csrf_token,
      allow_if: ->(_env) {
        # Skip CSRF validation when Rails forgery protection is disabled (e.g., in test
        # environment) or when OmniAuth is in test mode
        !ActionController::Base.allow_forgery_protection || OmniAuth.config.test_mode
      }
    )
  end
end
