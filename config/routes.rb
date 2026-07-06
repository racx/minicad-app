Rails.application.routes.draw do
  devise_for :users, only: [ :omniauth_callbacks ], controllers: {
    omniauth_callbacks: "users/omniauth_callbacks"
  }

  # Sign in is Google-only, so we expose the sign-in page (GET) and sign-out
  # (DELETE) but not Devise's password POST /users/sign_in.
  devise_scope :user do
    get    "/users/sign_in",  to: "users/sessions#new",     as: :new_user_session
    delete "/users/sign_out", to: "users/sessions#destroy", as: :destroy_user_session
  end

  authenticated :user do
    root to: "drawings#index", as: :authenticated_root
  end

  get "/try", to: "tries#show", as: :try

  resources :drawings, except: [ :new, :show ] do
    member do
      get   :rename
      patch :autosave
    end
  end

  root to: "pages#home"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end
