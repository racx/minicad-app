# frozen_string_literal: true

class GoogleOauth2CallbackService < BaseService
  option :auth

  def call
    return [ :failure, "Invalid Google account." ] unless google_uid && email
    return [ :failure, "Your Google email is not verified." ] unless email_verified?

    if (user = User.find_by(google_uid: google_uid))
      user.update(name: name, avatar_url: avatar_url)
      return [ :success, user ]
    end

    user = User.create!(
      email:      email,
      name:       name,
      avatar_url: avatar_url,
      google_uid: google_uid,
      password:   random_password # store a random password to make devise happy
    )
    [ :success, user ]
  rescue ActiveRecord::RecordInvalid
    [ :failure, "An account with this email already exists under a different Google identity." ]
  end

  private

  def google_uid = auth.uid.presence
  def email      = auth.info.email.presence
  def name       = auth.info.name.presence || email
  def avatar_url = auth.info.image.presence
  def email_verified? = auth.dig("extra", "id_info", "email_verified") == true

  # using max length supported by bcrypt
  def random_password = Devise.friendly_token(Devise.password_length.max)
end
