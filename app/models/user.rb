class User < ApplicationRecord
  devise :database_authenticatable, :trackable, :omniauthable

  has_many :drawings, dependent: :destroy
  has_many :ai_calls, dependent: :delete_all   # a deleted user takes their logs along

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true
  validates :google_uid, presence: true, uniqueness: true
  validates :plan, presence: true

  # Per-user daily AI counter: atomically bumps today's count and enforces the
  # cap. Returns false (and leaves the count at the cap) when the budget is spent.
  def register_ai_request!(limit:)
    today = Date.current
    if ai_requests_on != today
      update!(ai_requests_on: today, ai_requests_count: 1, ai_tokens_count: 0)
      return true
    end
    return false if ai_requests_count >= limit

    increment!(:ai_requests_count)
    true
  end

  def add_ai_tokens!(n)
    increment!(:ai_tokens_count, n) if n.positive?
  end
end
