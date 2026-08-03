require "test_helper"

class DrawingTest < ActiveSupport::TestCase
  setup do
    @drawing = drawings(:plan_a)
  end

  test "record_snapshot writes the first snapshot" do
    assert_difference "@drawing.snapshots.count", 1 do
      @drawing.record_snapshot
    end
    assert_equal @drawing.doc, @drawing.snapshots.last.doc
  end

  test "record_snapshot is throttled to one per 2 minutes" do
    @drawing.record_snapshot
    assert_no_difference "@drawing.snapshots.count" do
      @drawing.record_snapshot
    end

    travel Drawing::SNAPSHOT_INTERVAL + 1.second do
      assert_difference "@drawing.snapshots.count", 1 do
        @drawing.record_snapshot
      end
    end
  end

  test "record_snapshot prunes history to the newest 50" do
    55.times do |i|
      @drawing.snapshots.create!(doc: { i: i }, created_at: (100 - i).minutes.ago)
    end

    travel_to Time.current do
      @drawing.record_snapshot
    end

    assert_equal Drawing::SNAPSHOTS_KEPT, @drawing.snapshots.count
    # newest survive: the fresh snapshot plus the most recent history
    assert_equal @drawing.doc, @drawing.snapshots.order(created_at: :desc).first.doc
  end

  # The dashboard prints an object count per card. It used to get it by loading
  # the whole doc — megabytes of JSON per imported plan — so the count now
  # rides on the row and has to be kept honest by every write.
  test "entity_count tracks the doc on save" do
    @drawing.update!(doc: { "entities" => [ { "type" => "line" }, { "type" => "circle" } ] })
    assert_equal 2, @drawing.reload.entity_count

    @drawing.update!(doc: { "entities" => [] })
    assert_equal 0, @drawing.reload.entity_count
  end

  test "entity_count survives a doc with no entities key" do
    @drawing.update!(doc: { "layers" => [] })
    assert_equal 0, @drawing.reload.entity_count
  end

  test "entity_count is left alone when the doc does not change" do
    @drawing.update!(doc: { "entities" => [ { "type" => "line" } ] })
    @drawing.update!(title: "Renamed")
    assert_equal 1, @drawing.reload.entity_count
  end

  test "without_doc omits the heavy column but keeps the card's fields" do
    @drawing.update!(doc: { "entities" => [ { "type" => "line" } ] })
    slim = Drawing.without_doc.find(@drawing.id)

    assert_equal 1, slim.entity_count
    assert_equal @drawing.title, slim.title
    assert_equal @drawing.units, slim.units
    assert_raises(ActiveModel::MissingAttributeError) { slim.doc }
  end

  test "rejects unknown units" do
    @drawing.units = "furlong"
    assert_not @drawing.valid?
  end
end
