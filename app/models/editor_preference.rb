# The user's editor personalization (osnap modes, tracking, toggle row) as one
# opaque JSONB blob. The ENGINE owns the shape and tolerates garbage on apply
# (core/prefs.js), so the model only guards the container: it must be an
# object, and small — this is a settings record, not a document store.
class EditorPreference < ApplicationRecord
  MAX_BYTES = 4.kilobytes

  belongs_to :user

  validate :prefs_is_a_small_object

  private

  def prefs_is_a_small_object
    errors.add(:prefs, "must be an object") and return unless prefs.is_a?(Hash)
    errors.add(:prefs, "is too large") if prefs.to_json.bytesize > MAX_BYTES
  end
end
