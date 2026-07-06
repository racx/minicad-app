require "test_helper"

class GoogleOauth2CallbackServiceTest < ActiveSupport::TestCase
  def google_auth(uid: "g-1", email: "someone@example.com", name: "Someone",
                  image: nil, email_verified: true)
    OmniAuth::AuthHash.new(
      provider: "google_oauth2",
      uid:      uid,
      info:     { email: email, name: name, image: image },
      extra:    { id_info: { email_verified: email_verified } }
    )
  end

  test "creates a user with beta plan on first sign-in" do
    result = GoogleOauth2CallbackService.call(auth: google_auth(image: "https://img.example/x"))

    assert_pattern { result => [ :success, User ] }
    user = result.last
    assert_equal "beta", user.plan
    assert_equal "https://img.example/x", user.avatar_url
  end

  test "finds existing user by google_uid and refreshes profile" do
    existing = users(:rachad)
    result = GoogleOauth2CallbackService.call(
      auth: google_auth(uid: existing.google_uid, email: existing.email,
                        name: "Rachad Renamed", image: "https://img.example/new")
    )

    assert_equal [ :success, existing ], result
    assert_equal "Rachad Renamed", existing.reload.name
    assert_equal "https://img.example/new", existing.avatar_url
  end

  test "rejects blank uid or email" do
    assert_equal [ :failure, "Invalid Google account." ],
      GoogleOauth2CallbackService.call(auth: google_auth(uid: ""))
    assert_equal [ :failure, "Invalid Google account." ],
      GoogleOauth2CallbackService.call(auth: google_auth(email: nil))
  end

  test "rejects unverified email" do
    result = GoogleOauth2CallbackService.call(auth: google_auth(email_verified: false))
    assert_equal [ :failure, "Your Google email is not verified." ], result
  end

  test "rejects a taken email under a new google identity" do
    result = GoogleOauth2CallbackService.call(auth: google_auth(uid: "brand-new", email: users(:rachad).email))
    assert_pattern { result => [ :failure, String ] }
  end

  test "falls back to email when Google sends no name" do
    result = GoogleOauth2CallbackService.call(auth: google_auth(name: nil, email: "noname@example.com"))
    assert_equal "noname@example.com", result.last.name
  end
end
