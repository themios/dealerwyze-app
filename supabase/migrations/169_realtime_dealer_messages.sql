-- Enable Realtime on dealer_messages so clients receive live inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'dealer_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dealer_messages;
  END IF;
END $$;
