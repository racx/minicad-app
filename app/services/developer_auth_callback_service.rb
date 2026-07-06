# frozen_string_literal: true

# Local-only sign-in via OmniAuth's :developer strategy — no Google credentials
# needed in dev/test. Refuses to run outside Rails.env.local?.
class DeveloperAuthCallbackService < BaseService
  option :auth

  def call
    return [ :failure, "Developer sign-in is not available." ] unless Rails.env.local?
    return [ :failure, "Email is required." ] unless email

    user = User.find_by(email: email) || User.create!(
      email:      email,
      name:       email.split("@").first,
      google_uid: "dev:#{email}",
      password:   Devise.friendly_token(Devise.password_length.max)
    )
    [ :success, user ]
  end

  private

  def email = auth.info.email.presence
end
