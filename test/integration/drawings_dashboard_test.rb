require "test_helper"

class DrawingsDashboardTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:rachad)
    sign_in @user
  end

  test "dashboard lists only my drawings, newest first" do
    get drawings_path
    assert_response :success
    assert_match "Plan A", response.body
    assert_match "Plan B", response.body
    assert_no_match "Guest&#39;s plan", response.body
    assert_no_match "Guest's plan", response.body
  end

  test "create makes an untitled drawing and opens the editor" do
    assert_difference "@user.drawings.count", 1 do
      post drawings_path
    end
    drawing = @user.drawings.order(:created_at).last
    assert_redirected_to edit_drawing_path(drawing)
    assert_equal "Untitled", drawing.title
    assert_equal "cm", drawing.units
  end

  test "edit renders the editor mount with the doc payload" do
    get edit_drawing_path(drawings(:plan_a))
    assert_response :success
    assert_select "#editor-mount[data-drawing-id=?]", drawings(:plan_a).id.to_s
    assert_select "script#drawing-doc"
  end

  test "rename form and update" do
    drawing = drawings(:plan_a)
    get rename_drawing_path(drawing)
    assert_response :success
    assert_select "form input[name='drawing[title]']"

    patch drawing_path(drawing), params: { drawing: { title: "Ground floor" } }
    assert_response :success
    assert_equal "Ground floor", drawing.reload.title
    assert_match "Ground floor", response.body
  end

  test "blank title is rejected" do
    patch drawing_path(drawings(:plan_a)), params: { drawing: { title: "" } }
    assert_response :unprocessable_content
    assert_equal "Plan A", drawings(:plan_a).reload.title
  end

  test "destroy deletes the drawing and its snapshots" do
    drawing = drawings(:plan_a)
    drawing.snapshots.create!(doc: {})

    assert_difference [ "Drawing.count", "DrawingSnapshot.count" ], -1 do
      delete drawing_path(drawing)
    end
    assert_redirected_to drawings_path
  end

  test "cannot touch another user's drawing" do
    other = drawings(:guest_plan)

    # sign_in before each request: Devise's test hook is one-shot, and the
    # session cookie never commits on a request that raises (RecordNotFound).
    get edit_drawing_path(other)
    assert_response :not_found

    sign_in @user
    patch drawing_path(other), params: { drawing: { title: "mine now" } }
    assert_response :not_found

    sign_in @user
    delete drawing_path(other)
    assert_response :not_found
    assert Drawing.exists?(other.id)

    sign_in @user
    patch autosave_drawing_path(other), params: { doc: { "v" => 1 } }, as: :json
    assert_response :not_found
  end

  test "autosave persists doc and units and reports saved_at" do
    drawing = drawings(:plan_a)
    doc = { "layers" => [ { "name" => "0" } ], "entities" => [ { "type" => "line" } ], "idSeq" => 2 }

    patch autosave_drawing_path(drawing), params: { doc: doc, units: "m" }, as: :json
    assert_response :success

    body = JSON.parse(response.body)
    assert body["saved_at"].present?
    assert_equal drawing.reload.lock_version, body["lock_version"]
    assert_equal doc, drawing.doc
    assert_equal "m", drawing.units
  end

  test "autosave snapshots at most every 2 minutes" do
    drawing = drawings(:plan_a)

    assert_difference "drawing.snapshots.count", 1 do
      patch autosave_drawing_path(drawing), params: { doc: { "v" => 1 } }, as: :json
      patch autosave_drawing_path(drawing), params: { doc: { "v" => 2 } }, as: :json
    end

    travel Drawing::SNAPSHOT_INTERVAL + 1.second do
      assert_difference "drawing.snapshots.count", 1 do
        patch autosave_drawing_path(drawing), params: { doc: { "v" => 3 } }, as: :json
      end
    end
  end

  test "dashboard requires sign in" do
    sign_out @user
    get drawings_path
    assert_redirected_to new_user_session_path
  end
end
