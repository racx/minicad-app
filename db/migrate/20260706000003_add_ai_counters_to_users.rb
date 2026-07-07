class AddAiCountersToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :ai_requests_on, :date
    add_column :users, :ai_requests_count, :integer, null: false, default: 0
  end
end
