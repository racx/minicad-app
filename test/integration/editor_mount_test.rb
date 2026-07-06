require "test_helper"

class EditorMountTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:rachad)
    @drawing = drawings(:plan_a)
    sign_in @user
  end

  test "edit page carries everything the adapter needs" do
    get edit_drawing_path(@drawing)
    assert_response :success
    assert_select "#editor-mount[data-lock-version=?]", @drawing.lock_version.to_s
    assert_select "#editor-mount[data-updated-at=?]", @drawing.updated_at.iso8601
    assert_select "#editor-mount[data-autosave-url=?]", autosave_drawing_path(@drawing)
    assert_select "#editor-mount[data-copy-url=?]", drawings_path
    assert_select "script#drawing-doc"
    # editor layout: Vite bundle, no Tailwind stylesheet
    assert_match "vite", response.body
    assert_no_match "stylesheets", response.body
  end

  test "autosave with current lock_version succeeds and bumps it" do
    v = @drawing.lock_version
    patch autosave_drawing_path(@drawing),
      params: { doc: { "v" => 1 }, units: "cm", lock_version: v }, as: :json

    assert_response :success
    assert_equal v + 1, JSON.parse(response.body)["lock_version"]
  end

  test "stale lock_version gets 409 and does not overwrite" do
    original_doc = @drawing.doc
    patch autosave_drawing_path(@drawing),
      params: { doc: { "hijack" => true }, lock_version: @drawing.lock_version + 5 }, as: :json

    assert_response :conflict
    assert_equal @drawing.lock_version, JSON.parse(response.body)["lock_version"]
    assert_equal original_doc, @drawing.reload.doc
  end

  test "autosave without lock_version still saves (legacy/first boot)" do
    patch autosave_drawing_path(@drawing), params: { doc: { "v" => 2 } }, as: :json
    assert_response :success
  end

  test "save-as-copy creates a new drawing from JSON payload" do
    doc = { "layers" => [], "entities" => [ { "type" => "line" } ], "idSeq" => 2 }

    assert_difference "@user.drawings.count", 1 do
      post drawings_path, params: { title: "Plan A (copy)", units: "mm", doc: doc }, as: :json
    end
    assert_response :created

    copy = @user.drawings.order(:created_at).last
    assert_equal "Plan A (copy)", copy.title
    assert_equal "mm", copy.units
    assert_equal doc, copy.doc
    assert_equal edit_drawing_path(copy), JSON.parse(response.body)["edit_url"]
  end

  test "/try is public and renders the anonymous mount" do
    sign_out @user
    get try_path
    assert_response :success
    assert_select "#editor-mount[data-anonymous='true']"
    assert_select "#editor-mount[data-sign-in-url=?]", new_user_session_path
  end
end
