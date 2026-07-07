# One row per AI command call — queryable eval feedstock and price/quality
# evidence (request text, outcome, retries, tokens, latency, model string).
class AiCall < ApplicationRecord
  belongs_to :user
  belongs_to :drawing, optional: true   # logs outlive deleted drawings

  scope :today, -> { where(created_at: Date.current.all_day) }

  def tokens = prompt_tokens + completion_tokens
end
