module Api
  # GET/PATCH /api/preferences — the user's editor personalization (osnap
  # config, toggle row) as one opaque JSON blob, so settings tuned on the
  # desktop show up on the laptop. The engine defines and validates the
  # shape (core/prefs.js applies stored records defensively); the shell
  # only bounds the container (EditorPreference). Authenticated only —
  # /try keeps its localStorage fallback.
  class PreferencesController < ApplicationController
    def show
      render json: { prefs: current_user.editor_preference&.prefs || {} }
    end

    def update
      # Not mass assignment: the whole blob goes into ONE jsonb column, so the
      # already-parsed JSON body is read directly instead of strong-params'
      # permit machinery (request_parameters is the middleware-parsed body).
      body = request.request_parameters
      unless body.is_a?(Hash) && body.key?("prefs")
        return render json: { error: "prefs is required" }, status: :bad_request
      end

      # create_or_find_by rides the unique index, so two first-PATCHes racing
      # (two tabs at boot) converge on one row instead of a 500
      record = EditorPreference.create_or_find_by(user: current_user)
      record.prefs = body["prefs"]                      # non-object → model 422

      if record.save
        render json: { prefs: record.prefs, saved_at: record.updated_at.iso8601 }
      else
        render json: { error: record.errors.full_messages.first }, status: :unprocessable_entity
      end
    end
  end
end
