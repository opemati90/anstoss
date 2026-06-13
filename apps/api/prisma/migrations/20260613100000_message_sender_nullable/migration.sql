-- Allow system messages with no sender (messageType = 'SYSTEM')
ALTER TABLE "Message" ALTER COLUMN "senderId" DROP NOT NULL;
