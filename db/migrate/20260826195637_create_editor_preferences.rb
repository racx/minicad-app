# Editor personalization that should follow the user across devices — osnap
# configuration and the toggle row. Until now these lived only in localStorage
# (per browser) or reset every session. One row per user, opaque JSONB: the
# engine owns the shape, the shell just stores and returns it.
class CreateEditorPreferences < ActiveRecord::Migration[8.1]
  def change
    create_table :editor_preferences do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.jsonb :prefs, null: false, default: {}
      t.timestamps
    end
  end
end
