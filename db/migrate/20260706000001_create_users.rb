class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      ## Identity (Google-only sign-in — no password/reset flows)
      t.string :email,      null: false, default: ""
      t.string :name,       null: false, default: ""
      t.string :avatar_url
      t.string :google_uid, null: false
      t.string :plan,       null: false, default: "beta"

      ## Database authenticatable (Devise requirement; password is random, never used)
      t.string :encrypted_password, null: false, default: ""

      ## Trackable
      t.integer  :sign_in_count, default: 0, null: false
      t.datetime :current_sign_in_at
      t.datetime :last_sign_in_at
      t.string   :current_sign_in_ip
      t.string   :last_sign_in_ip

      t.timestamps null: false
    end

    add_index :users, :email,      unique: true
    add_index :users, :google_uid, unique: true
  end
end
