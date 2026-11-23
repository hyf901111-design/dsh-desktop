CREATE TABLE IF NOT EXISTS research_feedback_images (
  notification_id TEXT NOT NULL REFERENCES research_notifications(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  image TEXT NOT NULL,
  PRIMARY KEY (notification_id, position)
);
