class CreateAiCalls < ActiveRecord::Migration[8.1]
  def change
    # one row per AI call — eval feedstock and, later, price/quality evidence
    create_table :ai_calls do |t|
      t.references :user, null: false, foreign_key: true
      t.references :drawing, null: false, foreign_key: true
      t.string  :status, null: false                 # ok | clarify | failed
      t.text    :request, null: false
      t.text    :script
      t.text    :question
      t.integer :attempts, null: false, default: 1   # 1 = no retry
      t.integer :prompt_tokens, null: false, default: 0
      t.integer :completion_tokens, null: false, default: 0
      t.integer :latency_ms, null: false, default: 0
      t.string  :model, null: false, default: "stub"
      t.jsonb   :validator_errors, null: false, default: []
      t.datetime :created_at, null: false
    end
    add_index :ai_calls, [ :user_id, :created_at ]

    # daily token meter rides the existing per-day counter (same reset date)
    add_column :users, :ai_tokens_count, :integer, null: false, default: 0
  end
end
