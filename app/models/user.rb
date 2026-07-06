class User < ApplicationRecord
  devise :database_authenticatable, :trackable, :omniauthable

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true
  validates :google_uid, presence: true, uniqueness: true
  validates :plan, presence: true
end
