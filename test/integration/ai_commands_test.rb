require "test_helper"

class AiCommandsTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:rachad)
    @drawing = drawings(:plan_a)
    sign_in @user
  end

  def ask(request, drawing: @drawing)
    post api_drawing_ai_commands_path(drawing), params: { request: request, context: { units: "cm" } }, as: :json
  end

  test "canned test square returns ok with plan and MScript" do
    ask "please draw a test square"
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "ok", body["status"]
    assert_match "100×100", body["plan"]
    assert_match(/^RECT 0,0 100,100$/, body["script"])
    assert_nil body["question"]
  end

  test "anything else returns clarify with a question" do
    ask "draw my dream house"
    assert_response :success

    body = JSON.parse(response.body)
    assert_equal "clarify", body["status"]
    assert_nil body["script"]
    assert_match "test square", body["question"]
  end

  test "requests bump the per-user daily counter and reset next day" do
    ask "draw a test square"
    ask "and a pony"
    assert_equal 2, @user.reload.ai_requests_count
    assert_equal Date.current, @user.ai_requests_on

    travel 1.day do
      ask "draw a test square"
      assert_equal 1, @user.reload.ai_requests_count
    end
  end

  test "daily cap returns 429 limit and stops counting" do
    @user.update!(ai_requests_on: Date.current,
                  ai_requests_count: Api::AiCommandsController::DAILY_LIMIT)
    ask "draw a test square"
    assert_response :too_many_requests

    body = JSON.parse(response.body)
    assert_equal "limit", body["status"]
    assert_match "Daily AI limit", body["question"]
    assert_equal Api::AiCommandsController::DAILY_LIMIT, @user.reload.ai_requests_count
  end

  test "scoped to the owner's drawings" do
    ask "draw a test square", drawing: drawings(:guest_plan)
    assert_response :not_found
  end

  test "requires authentication" do
    sign_out @user
    ask "draw a test square"
    assert_response :unauthorized
  end

  test "rack-attack throttles 10/min/user" do
    Rack::Attack.enabled = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new

    10.times { ask "draw a test square" }
    assert_response :success

    ask "draw a test square"
    assert_response :too_many_requests
    assert_equal "limit", JSON.parse(response.body)["status"]
    assert_match "wait a minute", JSON.parse(response.body)["question"]
  ensure
    Rack::Attack.enabled = false
  end
end
