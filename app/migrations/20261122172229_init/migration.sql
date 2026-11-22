-- CreateEnum
CREATE TYPE "ProfileSourceKind" AS ENUM ('website', 'resume', 'oneliner');

-- CreateEnum
CREATE TYPE "FactSensitivity" AS ENUM ('public', 'shareable', 'private');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('model_processing', 'meeting_listening', 'phone_calls', 'matching', 'identity_reveal');

-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('SELL', 'BUY', 'WORK_FOR');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('customers', 'investors', 'manufacturer', 'supplier', 'intern', 'employer');

-- CreateEnum
CREATE TYPE "Autonomy" AS ENUM ('WATCH', 'PREPARE', 'ACT');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('NEW', 'VETTED', 'APPROVED', 'REJECTED', 'CONTACTED');

-- CreateEnum
CREATE TYPE "SourceProvider" AS ENUM ('fiber', 'ploid', 'web');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DecisionChannel" AS ENUM ('web', 'thread', 'voice');

-- CreateEnum
CREATE TYPE "GatewayDecision" AS ENUM ('ALLOW', 'DENY', 'NEEDS_APPROVAL');

-- CreateEnum
CREATE TYPE "RequestOrigin" AS ENUM ('thread', 'watcher', 'voice', 'meeting', 'ui', 'system');

-- CreateEnum
CREATE TYPE "AdapterMode" AS ENUM ('live', 'record', 'replay');

-- CreateEnum
CREATE TYPE "PitchMode" AS ENUM ('TEXT', 'ROOM');

-- CreateEnum
CREATE TYPE "ScoreTier" AS ENUM ('LIVE', 'MEASURED');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('preference', 'objection', 'outcome', 'fact');

-- CreateEnum
CREATE TYPE "WatcherRuntime" AS ENUM ('local', 'maritime');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ShareCardStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceKind" "ProfileSourceKind" NOT NULL,
    "summary" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sensitivity" "FactSensitivity" NOT NULL,
    "allowedPurposes" TEXT[],

    CONSTRAINT "ProfileFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "scope" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "GoalDirection" NOT NULL,
    "kind" "GoalKind" NOT NULL,
    "statement" TEXT NOT NULL,
    "icp" JSONB NOT NULL DEFAULT '{}',
    "autonomy" "Autonomy" NOT NULL DEFAULT 'PREPARE',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "watcherTokenHash" TEXT,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goalId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'NEW',
    "rejectReason" TEXT,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRef" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matchId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "provider" "SourceProvider" NOT NULL,
    "url" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matchId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "provider" "SourceProvider" NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matchId" TEXT NOT NULL,
    "contactId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "personalizationRefs" TEXT[],
    "usedFactIds" TEXT[],

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedVia" "DecisionChannel",
    "alterApprovalId" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "draftId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "redirectedTo" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailOrDomain" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "actor" JSONB NOT NULL,
    "origin" "RequestOrigin" NOT NULL,
    "actionType" TEXT NOT NULL,
    "decision" "GatewayDecision" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reason" TEXT,
    "inputSummary" TEXT,
    "factIdsSent" TEXT[],
    "traceId" TEXT,
    "adapterMode" "AdapterMode",

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goalId" TEXT NOT NULL,
    "personas" JSONB NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goalId" TEXT NOT NULL,
    "panelId" TEXT,
    "mode" "PitchMode" NOT NULL,
    "parentRunId" TEXT,
    "transcript" TEXT,
    "summary" JSONB,
    "engine" TEXT,

    CONSTRAINT "PitchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentScore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "interest" INTEGER NOT NULL,
    "objection" TEXT,
    "tier" "ScoreTier" NOT NULL,

    CONSTRAINT "SegmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "kind" "MemoryKind" NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalRef" TEXT,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatcherRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goalId" TEXT NOT NULL,
    "runtime" "WatcherRuntime" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,

    CONSTRAINT "WatcherRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeedProposal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "transcriptExcerpt" TEXT NOT NULL,
    "proposedGoal" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "NeedProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareCard" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "fields" JSONB NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ShareCardStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "ShareCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cardAId" TEXT NOT NULL,
    "cardBId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "aAccepted" BOOLEAN NOT NULL DEFAULT false,
    "bAccepted" BOOLEAN NOT NULL DEFAULT false,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "CardMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "providerName" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "providerData" TEXT NOT NULL DEFAULT '{}',
    "authId" TEXT NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("providerName","providerUserId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_userId_idx" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "ProfileFact_profileId_idx" ON "ProfileFact"("profileId");

-- CreateIndex
CREATE INDEX "Consent_userId_kind_idx" ON "Consent"("userId", "kind");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Match_goalId_companyId_key" ON "Match"("goalId", "companyId");

-- CreateIndex
CREATE INDEX "SourceRef_matchId_idx" ON "SourceRef"("matchId");

-- CreateIndex
CREATE INDEX "Contact_matchId_idx" ON "Contact"("matchId");

-- CreateIndex
CREATE INDEX "Draft_matchId_idx" ON "Draft"("matchId");

-- CreateIndex
CREATE INDEX "Approval_userId_status_idx" ON "Approval"("userId", "status");

-- CreateIndex
CREATE INDEX "OutreachMessage_draftId_idx" ON "OutreachMessage"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "OptOut_emailOrDomain_key" ON "OptOut"("emailOrDomain");

-- CreateIndex
CREATE INDEX "ActionLog_userId_ts_idx" ON "ActionLog"("userId", "ts");

-- CreateIndex
CREATE INDEX "ActionLog_goalId_ts_idx" ON "ActionLog"("goalId", "ts");

-- CreateIndex
CREATE INDEX "Panel_goalId_idx" ON "Panel"("goalId");

-- CreateIndex
CREATE INDEX "PitchRun_goalId_idx" ON "PitchRun"("goalId");

-- CreateIndex
CREATE INDEX "SegmentScore_runId_index_idx" ON "SegmentScore"("runId", "index");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_kind_idx" ON "MemoryItem"("userId", "kind");

-- CreateIndex
CREATE INDEX "WatcherRun_goalId_startedAt_idx" ON "WatcherRun"("goalId", "startedAt");

-- CreateIndex
CREATE INDEX "NeedProposal_userId_status_idx" ON "NeedProposal"("userId", "status");

-- CreateIndex
CREATE INDEX "ShareCard_userId_idx" ON "ShareCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardMatch_cardAId_cardBId_key" ON "CardMatch"("cardAId", "cardBId");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_key" ON "Session"("id");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFact" ADD CONSTRAINT "ProfileFact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRef" ADD CONSTRAINT "SourceRef_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchRun" ADD CONSTRAINT "PitchRun_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchRun" ADD CONSTRAINT "PitchRun_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchRun" ADD CONSTRAINT "PitchRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "PitchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentScore" ADD CONSTRAINT "SegmentScore_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PitchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatcherRun" ADD CONSTRAINT "WatcherRun_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedProposal" ADD CONSTRAINT "NeedProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareCard" ADD CONSTRAINT "ShareCard_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMatch" ADD CONSTRAINT "CardMatch_cardAId_fkey" FOREIGN KEY ("cardAId") REFERENCES "ShareCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMatch" ADD CONSTRAINT "CardMatch_cardBId_fkey" FOREIGN KEY ("cardBId") REFERENCES "ShareCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
