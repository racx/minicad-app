module Users
  class OmniauthCallbacksController < Devise::OmniauthCallbacksController
    def google_oauth2
      case GoogleOauth2CallbackService.call(auth: auth_hash)
      in [ :success, user ]
        set_flash_message!(:notice, :success, kind: "Google") if is_navigational_format?
        sign_in_and_redirect user, event: :authentication
      in [ :failure, reason ]
        redirect_to new_user_session_path, alert: reason
      end
    end

    if Rails.env.local?
      def developer
        case DeveloperAuthCallbackService.call(auth: auth_hash)
        in [ :success, user ]
          set_flash_message!(:notice, :success, kind: "Developer") if is_navigational_format?
          sign_in_and_redirect user, event: :authentication
        in [ :failure, reason ]
          redirect_to new_user_session_path, alert: reason
        end
      end
    end

    def failure
      redirect_to new_user_session_path, alert: "Google authentication failed."
    end

    private

    def auth_hash
      request.env.fetch("omniauth.auth")
    end
  end
end
