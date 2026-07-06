class Drawing < ApplicationRecord
  SNAPSHOT_INTERVAL = 2.minutes
  SNAPSHOTS_KEPT    = 50

  belongs_to :user
  has_many :snapshots, class_name: "DrawingSnapshot", dependent: :delete_all

  validates :title, presence: true
  validates :units, inclusion: { in: %w[mm cm m] }

  # Autosave safety net: at most one snapshot per SNAPSHOT_INTERVAL per drawing,
  # pruned to the newest SNAPSHOTS_KEPT.
  def record_snapshot
    return if snapshots.where(created_at: SNAPSHOT_INTERVAL.ago..).exists?

    snapshots.create!(doc: doc)
    stale_ids = snapshots.order(created_at: :desc, id: :desc).offset(SNAPSHOTS_KEPT).pluck(:id)
    snapshots.where(id: stale_ids).delete_all if stale_ids.any?
  end
end
