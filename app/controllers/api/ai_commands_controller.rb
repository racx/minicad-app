module Api
  class AiCommandsController < ApplicationController
    DAILY_LIMIT = ENV.fetch("AI_DAILY_LIMIT", "200").to_i

    # POST /api/drawings/:id/ai_commands  {request, context}
    # → {status, plan, script, question} — status: ok | clarify | limit
    def create
      drawing = current_user.drawings.find(params[:id])

      unless current_user.register_ai_request!(limit: DAILY_LIMIT)
        return render json: { status: "limit", plan: nil, script: nil,
                              question: "Daily AI limit reached (#{DAILY_LIMIT}/day) — resets tomorrow." },
                      status: :too_many_requests
      end

      result = AiCommandService.call(
        request: params[:request],
        context: params[:context].respond_to?(:to_unsafe_h) ? params[:context].to_unsafe_h : {},
        clarify: params[:clarify].respond_to?(:to_unsafe_h) ? params[:clarify].to_unsafe_h : nil,
        drawing: drawing
      )
      meta = result.delete(:meta) || {}
      current_user.add_ai_tokens!(meta[:prompt_tokens].to_i + meta[:completion_tokens].to_i)
      AiCall.create!(
        user: current_user, drawing: drawing,
        status: meta[:failed] ? "failed" : result[:status],
        request: params[:request].to_s, script: result[:script], question: result[:question],
        attempts: [ meta[:attempts].to_i, 1 ].max,
        prompt_tokens: meta[:prompt_tokens].to_i, completion_tokens: meta[:completion_tokens].to_i,
        latency_ms: meta[:latency_ms].to_i, model: meta[:model].presence || "stub",
        validator_errors: meta[:validator_errors] || []
      )
      Rails.logger.info("ai_commands user=#{current_user.id} drawing=#{drawing.id} " \
                        "status=#{result[:status]} attempts=#{meta[:attempts]} " \
                        "tokens=#{current_user.ai_tokens_count} model=#{meta[:model]}")
      render json: result
    end
  end
end
