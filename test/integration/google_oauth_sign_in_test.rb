require "test_helper"

class GoogleOauthSignInTest < ActionDispatch::IntegrationTest
  test "verified Google account creates a user and signs in" do
    mock_google_auth(uid: "g-123", email: "new@example.com", name: "New User",
                     image: "https://lh3.googleusercontent.com/a/photo")

    assert_difference "User.count", 1 do
      sign_in_with_google
    end
    assert_redirected_to authenticated_root_path

    user = User.find_by!(google_uid: "g-123")
    assert_equal "new@example.com", user.email
    assert_equal "New User", user.name
    assert_equal "https://lh3.googleusercontent.com/a/photo", user.avatar_url
    assert_equal "beta", user.plan
  end

  test "existing user signs in without creating another" do
    mock_google_auth(uid: users(:rachad).google_uid, email: users(:rachad).email, name: "Rachad")

    assert_no_difference "User.count" do
      sign_in_with_google
    end
    assert_redirected_to authenticated_root_path
  end

  test "unverified Google email is rejected" do
    mock_google_auth(uid: "g-999", email: "shady@example.com", email_verified: false)

    assert_no_difference "User.count" do
      sign_in_with_google
    end
    assert_redirected_to new_user_session_path
    assert_equal "Your Google email is not verified.", flash[:alert]
  end

  test "existing email under a different Google identity is rejected" do
    mock_google_auth(uid: "different-uid", email: users(:rachad).email)

    assert_no_difference "User.count" do
      sign_in_with_google
    end
    assert_redirected_to new_user_session_path
  end

  test "unauthenticated visitors are sent to sign in" do
    get drawings_path
    assert_redirected_to new_user_session_path
  end

  test "root shows the public landing page when logged out" do
    get "/"
    assert_response :success
    assert_match "Try the editor", response.body
  end

  test "signed-in user sees the placeholder dashboard and can sign out" do
    sign_in users(:rachad)
    get authenticated_root_path
    assert_response :success
    assert_match users(:rachad).name, response.body

    delete destroy_user_session_path
    get drawings_path
    assert_redirected_to new_user_session_path
  end

  test "sign-in page renders the Google button without authentication" do
    get new_user_session_path
    assert_response :success
    assert_match "Sign in with Google", response.body
  end

  test "healthcheck stays public" do
    get rails_health_check_path
    assert_response :success
  end
end
