require "test_helper"

# /api/preferences — editor personalization (osnap config, toggles) persisted
# per user so it follows them across devices. The blob is engine-owned; the
# shell stores, bounds, and returns it.
class EditorPreferencesTest < ActionDispatch::IntegrationTest
  SAMPLE = {
    "osnap" => { "modes" => %w[end mid cen], "tracking" => true },
    "toggles" => { "grid" => false, "ortho" => true, "dyn" => true }
  }.freeze

  setup do
    @user = users(:rachad)
    sign_in @user
  end

  test "fresh user reads empty prefs" do
    get api_preferences_path, as: :json
    assert_response :success
    assert_equal({}, JSON.parse(response.body)["prefs"])
  end

  test "patch creates the record and get returns it" do
    assert_difference "EditorPreference.count", 1 do
      patch api_preferences_path, params: { prefs: SAMPLE }, as: :json
    end
    assert_response :success
    assert_equal SAMPLE, JSON.parse(response.body)["prefs"]

    get api_preferences_path, as: :json
    assert_equal SAMPLE, JSON.parse(response.body)["prefs"]
  end

  test "patch again updates in place, no second row" do
    patch api_preferences_path, params: { prefs: SAMPLE }, as: :json
    tweaked = SAMPLE.deep_merge("toggles" => { "ortho" => false })
    assert_no_difference "EditorPreference.count" do
      patch api_preferences_path, params: { prefs: tweaked }, as: :json
    end
    assert_equal false, @user.editor_preference.reload.prefs.dig("toggles", "ortho")
  end

  test "preferences are per user" do
    patch api_preferences_path, params: { prefs: SAMPLE }, as: :json
    sign_in users(:guest)
    get api_preferences_path, as: :json
    assert_equal({}, JSON.parse(response.body)["prefs"])
  end

  test "missing prefs is a 400, non-object a 422, oversize a 422" do
    patch api_preferences_path, params: {}, as: :json
    assert_response :bad_request

    patch api_preferences_path, params: { prefs: "garbage" }, as: :json
    assert_response :unprocessable_entity

    patch api_preferences_path, params: { prefs: { "blob" => "x" * 5.kilobytes } }, as: :json
    assert_response :unprocessable_entity
    # create_or_find_by may leave an empty row behind a refused PATCH — benign,
    # as long as no refused prefs were stored
    get api_preferences_path, as: :json
    assert_equal({}, JSON.parse(response.body)["prefs"])
  end

  test "signed out is refused" do
    sign_out @user
    get api_preferences_path, as: :json
    assert_response :unauthorized
  end

  test "deleting the user takes the preferences along" do
    patch api_preferences_path, params: { prefs: SAMPLE }, as: :json
    assert_difference "EditorPreference.count", -1 do
      @user.destroy!
    end
  end
end
