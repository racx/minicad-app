class CreateDrawings < ActiveRecord::Migration[8.1]
  def change
    create_table :drawings do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false, default: "Untitled"
      t.jsonb :doc, null: false, default: {}
      t.string :units, null: false, default: "cm"
      # Optimistic locking — the Stage 4 editor uses this to refuse silent overwrites.
      t.integer :lock_version, null: false, default: 0

      t.timestamps null: false
    end

    create_table :drawing_snapshots do |t|
      t.references :drawing, null: false, foreign_key: true
      t.jsonb :doc, null: false, default: {}
      t.datetime :created_at, null: false
    end

    add_index :drawing_snapshots, [ :drawing_id, :created_at ]
  end
end
