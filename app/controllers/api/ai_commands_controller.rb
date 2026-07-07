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
      Rails.logger.info("ai_commands user=#{current_user.id} drawing=#{drawing.id} " \
                        "status=#{result[:status]} count=#{current_user.ai_requests_count}")
      render json: result
    end
  end
end
