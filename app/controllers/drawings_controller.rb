class DrawingsController < ApplicationController
  before_action :set_drawing, except: [ :index, :create ]

  def index
    @drawings = current_user.drawings.order(updated_at: :desc)
  end

  def create
    drawing = current_user.drawings.create!
    redirect_to edit_drawing_path(drawing)
  end

  # Mounts the Vite editor entrypoint (engine UI — its own CSS, no Tailwind).
  def edit
    render layout: "editor"
  end

  # Inline title edit on the dashboard (turbo frame).
  def rename
  end

  def update
    if @drawing.update(params.expect(drawing: [ :title ]))
      render partial: "drawing", locals: { drawing: @drawing }
    else
      render :rename, status: :unprocessable_content
    end
  end

  # JSON autosave from the editor: persists the doc and, at most every
  # 2 minutes per drawing, records a pruned history snapshot.
  def autosave
    @drawing.update!(doc: params[:doc].to_unsafe_h, units: params[:units].presence || @drawing.units)
    @drawing.record_snapshot
    render json: { saved_at: @drawing.updated_at.iso8601, lock_version: @drawing.lock_version }
  end

  def destroy
    @drawing.destroy!
    redirect_to drawings_path, status: :see_other, notice: "Drawing deleted."
  end

  private

  def set_drawing
    @drawing = current_user.drawings.find(params[:id])
  end
end
