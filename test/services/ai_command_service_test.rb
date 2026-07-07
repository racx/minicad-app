require "test_helper"

class AiCommandServiceTest < ActiveSupport::TestCase
  class FakeProvider
    attr_reader :calls
    def initialize(*replies)
      @replies = replies
      @calls = []
    end

    def chat(messages:)
      @calls << messages.map(&:dup)
      { content: @replies.shift || "{}", usage: { "prompt_tokens" => 10, "completion_tokens" => 5 },
        model: "fake-model", latency_ms: 1 }
    end
  end

  setup do
    @drawing = drawings(:plan_a)
    @drawing.update!(doc: { "layers" => [ { "name" => "0", "color" => "#fff" } ],
                            "entities" => [ { "id" => 1, "type" => "line", "layer" => "0",
                                              "x1" => 0, "y1" => 0, "x2" => 100, "y2" => 0 } ],
                            "idSeq" => 2, "units" => "cm" })
  end

  def call(provider, request: "move the line", clarify: nil)
    AiCommandService.call(request: request, context: { units: "cm" }, clarify: clarify,
                          drawing: @drawing, provider: provider)
  end

  test "valid script passes engine validation and returns ok" do
    provider = FakeProvider.new('{"status":"ok","plan":"Move line #1 up.","script":"MOVE #1 0,10","question":null}')
    result = call(provider)
    assert_equal "ok", result[:status]
    assert_equal "MOVE #1 0,10", result[:script]
    assert_equal 1, provider.calls.size
  end

  test "invalid script triggers ONE retry with line-numbered errors, then succeeds" do
    provider = FakeProvider.new(
      '{"status":"ok","plan":"x","script":"MOVE #99 5,0","question":null}',
      '{"status":"ok","plan":"x","script":"MOVE #1 5,0","question":null}'
    )
    result = call(provider)
    assert_equal "ok", result[:status]
    assert_equal 2, provider.calls.size
    retry_msg = provider.calls.last.last[:content]
    assert_match(/line 1: no entity #99/, retry_msg)
    assert_match(/FULL corrected script/, retry_msg)
  end

  test "two invalid attempts end in a clean clarify, never a stack trace" do
    provider = FakeProvider.new(
      '{"status":"ok","plan":"x","script":"BOGUS 1,2","question":null}',
      '{"status":"ok","plan":"x","script":"STILL BOGUS","question":null}'
    )
    result = call(provider)
    assert_equal "clarify", result[:status]
    assert_match(/couldn't produce a valid script/, result[:question])
    assert_equal 2, provider.calls.size
  end

  test "model clarify passes straight through" do
    provider = FakeProvider.new('{"status":"clarify","plan":null,"script":null,"question":"Which line?"}')
    result = call(provider)
    assert_equal({ status: "clarify", plan: nil, script: nil, question: "Which line?" }, result)
  end

  test "garbage reply becomes a friendly failure" do
    provider = FakeProvider.new("I am totally a JSON object, trust me")
    result = call(provider)
    assert_equal "clarify", result[:status]
    assert_match(/couldn't read/, result[:question])
  end

  test "fenced JSON is extracted" do
    provider = FakeProvider.new("```json\n{\"status\":\"ok\",\"plan\":\"p\",\"script\":\"MOVE #1 1,0\",\"question\":null}\n```")
    assert_equal "ok", call(provider)[:status]
  end

  test "clarify round is replayed into the conversation" do
    provider = FakeProvider.new('{"status":"ok","plan":"p","script":"MOVE #1 5,0","question":null}')
    call(provider, request: "the first one",
         clarify: { "request" => "make it bigger", "question" => "Which one?" })
    msgs = provider.calls.first
    assert msgs.any? { |m| m[:role] == "user" && m[:content].include?("make it bigger") }
    assert msgs.any? { |m| m[:role] == "assistant" && m[:content].include?("Which one?") }
    assert_equal "ANSWER: the first one", msgs.last[:content]
  end

  test "no provider configured falls back to the canned stub" do
    result = AiCommandService.call(request: "draw a test square", context: {}, drawing: @drawing, provider: nil)
    assert_equal "ok", result[:status]
    assert_match(/RECT 0,0 100,100/, result[:script])
  end

  test "system prompt embeds the design-doc grammar verbatim" do
    assert AiPrompt.system_prompt.include?(AiPrompt.grammar_block)
    assert_match(/HATCH\s+<sel-single> <material-key>/, AiPrompt.system_prompt)
  end
end
