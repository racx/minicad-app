class Drawing < ApplicationRecord
  SNAPSHOT_INTERVAL = 2.minutes
  SNAPSHOTS_KEPT    = 50

  belongs_to :user
  has_many :snapshots, class_name: "DrawingSnapshot", dependent: :delete_all
  has_many :ai_calls, dependent: :nullify   # call logs are usage evidence — keep them

  # Everything the dashboard renders EXCEPT the drawing itself. Selecting
  # `doc` there means fetching, decompressing and deserialising every stored
  # plan to print a title and a count.
  scope :without_doc, -> { select(column_names - [ "doc" ]) }

  validates :title, presence: true
  validates :units, inclusion: { in: %w[mm cm m] }

  # The dashboard needs the object count and nothing else from the doc. Loading
  # 4.8 MB of JSON per card to call .size on an array is the sort of thing that
  # is invisible until the list is long, so the count rides on the row.
  before_save :count_entities, if: :will_save_change_to_doc?

  # Autosave safety net: at most one snapshot per SNAPSHOT_INTERVAL per drawing,
  # pruned to the newest SNAPSHOTS_KEPT.
  def record_snapshot
    return if snapshots.where(created_at: SNAPSHOT_INTERVAL.ago..).exists?

    snapshots.create!(doc: doc)
    stale_ids = snapshots.order(created_at: :desc, id: :desc).offset(SNAPSHOTS_KEPT).pluck(:id)
    snapshots.where(id: stale_ids).delete_all if stale_ids.any?
  end

  private

  def count_entities
    entities = doc.is_a?(Hash) ? doc["entities"] : nil
    self.entity_count = entities.is_a?(Array) ? entities.size : 0
  end
end
