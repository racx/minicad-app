class AddEntityCountToDrawings < ActiveRecord::Migration[8.1]
  # The dashboard prints "17,717 objects" on every card. It was getting that
  # number by loading the whole doc — 4.8 MB of JSON for one imported house
  # plan — and asking Ruby for the array length. Keep the count on the row.
  def up
    add_column :drawings, :entity_count, :integer, default: 0, null: false

    # Postgres can count the array without shipping it anywhere.
    execute <<~SQL
      UPDATE drawings
      SET entity_count = COALESCE(jsonb_array_length(doc -> 'entities'), 0)
      WHERE jsonb_typeof(doc -> 'entities') = 'array'
    SQL
  end

  def down
    remove_column :drawings, :entity_count
  end
end
