class DrawingsController < ApplicationController
  before_action :set_drawing, except: [ :index, :create ]

  def index
    @drawings = current_user.drawings.order(updated_at: :desc)
  end

  # Dashboard "New drawing" button (html) and the editor's save-as-copy
  # conflict escape hatch (json, carries doc/units/title).
  def create
    drawing = current_user.drawings.create!(create_params)

    respond_to do |format|
      format.html { redirect_to edit_drawing_path(drawing) }
      format.json { render json: { id: drawing.id, edit_url: edit_drawing_path(drawing) }, status: :created }
    end
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
  # 2 minutes per drawing, records a pruned history snapshot. Refuses stale
  # writes (optimistic lock) so a second tab can never silently overwrite.
  def autosave
    if params[:lock_version].present? && params[:lock_version].to_i != @drawing.lock_version
      return render json: { error: "conflict", lock_version: @drawing.lock_version }, status: :conflict
    end

    @drawing.update!(doc: params[:doc].to_unsafe_h, units: params[:units].presence || @drawing.units)
    @drawing.record_snapshot
    render json: { saved_at: @drawing.updated_at.iso8601, lock_version: @drawing.lock_version }
  rescue ActiveRecord::StaleObjectError
    render json: { error: "conflict", lock_version: @drawing.reload.lock_version }, status: :conflict
  end

  def destroy
    @drawing.destroy!
    redirect_to drawings_path, status: :see_other, notice: "Drawing deleted."
  end

  private

  def set_drawing
    @drawing = current_user.drawings.find(params[:id])
  end

  def create_params
    {
      title: params[:title].presence || "Untitled",
      units: params[:units].presence || "cm",
      doc:   params[:doc].respond_to?(:to_unsafe_h) ? params[:doc].to_unsafe_h : {}
    }
  end
end
