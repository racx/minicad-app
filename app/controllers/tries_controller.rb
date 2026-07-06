# /try — anonymous editor, localStorage-only, with a "sign in to save" nudge.
class TriesController < ApplicationController
  skip_before_action :authenticate_user!

  def show
    render layout: "editor"
  end
end
