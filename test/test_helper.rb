ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end

module ActionDispatch
  class IntegrationTest
    include Devise::Test::IntegrationHelpers

    # In OmniAuth test mode, POSTing to the authorize path redirects straight
    # to the callback with this AuthHash in request.env["omniauth.auth"].
    def mock_google_auth(uid:, email:, name: "Test User", image: nil, email_verified: true)
      OmniAuth.config.test_mode = true
      OmniAuth.config.mock_auth[:google_oauth2] = OmniAuth::AuthHash.new(
        provider: "google_oauth2",
        uid:      uid,
        info:     { email: email, name: name, image: image },
        extra:    { id_info: { email_verified: email_verified } }
      )
    end

    def sign_in_with_google
      post user_google_oauth2_omniauth_authorize_path
      follow_redirect!
    end

    teardown do
      OmniAuth.config.mock_auth[:google_oauth2] = nil
      OmniAuth.config.test_mode = false
    end
  end
end
