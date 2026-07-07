# frozen_string_literal: true

# Stage-5 stub for the AI drawing endpoint. Returns the fixed contract
# {status, plan, script, question}: a canned MScript for "draw a test square",
# a clarify question for everything else. The real model call replaces #call
# without touching the contract, the guardrails or the client loop.
class AiCommandStubService < BaseService
  option :request
  option :context, default: -> { {} }

  CANNED_SQUARE = <<~MSCRIPT
    # test square, 100×100 drawing units at the origin
    RECT 0,0 100,100
  MSCRIPT

  def call
    if request.to_s.downcase.match?(/test\s+square/)
      { status: "ok",
        plan: "Draw a 100×100 test square at the origin.",
        script: CANNED_SQUARE.strip,
        question: nil }
    else
      { status: "clarify",
        plan: nil,
        script: nil,
        question: "The AI can only draw a test square during the beta — try “draw a test square”." }
    end
  end
end
