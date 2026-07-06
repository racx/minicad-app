# frozen_string_literal: true

class BaseService
  extend Dry::Initializer

  delegate :logger,      to: :Rails
  delegate :transaction, to: :ApplicationRecord

  def self.call(...)
    new(...).call
  end
end
