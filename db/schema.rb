# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_07_000002) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ai_calls", force: :cascade do |t|
    t.integer "attempts", default: 1, null: false
    t.integer "completion_tokens", default: 0, null: false
    t.datetime "created_at", null: false
    t.bigint "drawing_id"
    t.integer "latency_ms", default: 0, null: false
    t.string "model", default: "stub", null: false
    t.integer "prompt_tokens", default: 0, null: false
    t.text "question"
    t.text "request", null: false
    t.text "script"
    t.string "status", null: false
    t.bigint "user_id", null: false
    t.jsonb "validator_errors", default: [], null: false
    t.index ["drawing_id"], name: "index_ai_calls_on_drawing_id"
    t.index ["user_id", "created_at"], name: "index_ai_calls_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_ai_calls_on_user_id"
  end

  create_table "drawing_snapshots", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "doc", default: {}, null: false
    t.bigint "drawing_id", null: false
    t.index ["drawing_id", "created_at"], name: "index_drawing_snapshots_on_drawing_id_and_created_at"
    t.index ["drawing_id"], name: "index_drawing_snapshots_on_drawing_id"
  end

  create_table "drawings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "doc", default: {}, null: false
    t.integer "lock_version", default: 0, null: false
    t.string "title", default: "Untitled", null: false
    t.string "units", default: "cm", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_drawings_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.integer "ai_requests_count", default: 0, null: false
    t.date "ai_requests_on"
    t.integer "ai_tokens_count", default: 0, null: false
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.datetime "current_sign_in_at"
    t.string "current_sign_in_ip"
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "google_uid", null: false
    t.datetime "last_sign_in_at"
    t.string "last_sign_in_ip"
    t.string "name", default: "", null: false
    t.string "plan", default: "beta", null: false
    t.integer "sign_in_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["google_uid"], name: "index_users_on_google_uid", unique: true
  end

  add_foreign_key "ai_calls", "drawings"
  add_foreign_key "ai_calls", "users"
  add_foreign_key "drawing_snapshots", "drawings"
  add_foreign_key "drawings", "users"
end
