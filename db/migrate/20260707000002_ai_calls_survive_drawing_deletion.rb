class AiCallsSurviveDrawingDeletion < ActiveRecord::Migration[8.1]
  # AI call logs are usage/eval evidence — they outlive the drawing they were
  # made against (nullify), but leave with their user (delete_all on User).
  def change
    change_column_null :ai_calls, :drawing_id, true
  end
end
