import React from 'react';
import { FunctionCall } from '@google/genai';
import ChatTab from '../tabs/ChatTab';
import TestingTab from '../tabs/TestingTab';
import { ConversationFeedback, WordEntry, ReplacementRule, KnowledgeDocument, ChatMessage } from '../types';

interface SimpleUserViewProps {
    handleFunctionCall: (functionCall: FunctionCall) => void;
    handleError: (msg: string) => void;
    handleSuccess: (msg: string) => void;
    conversationFeedback: ConversationFeedback[];
    addConversationFeedback: (feedback: Omit<ConversationFeedback, 'id' | 'timestamp'>) => void;
    database: WordEntry[];
    customInstructions: string;
    replacementMap: ReplacementRule[];
    knowledgeBase: KnowledgeDocument[];
    userStyleProfile: string;
    handleAnalyzeConversation: (transcript: ChatMessage[]) => void;
    loadingStates: Record<string, boolean>;
    setLoading: (key: string, value: boolean) => void;
    isLiveSessionActive: boolean;
    toggleLiveSession: (options: { script: string | null, customInstructions: string, useKnowledge: boolean, knowledgeBase: KnowledgeDocument[], userStyleProfile: string }) => void;
    liveTranscript: { speaker: 'user' | 'model', text: string }[];
    useDatabaseForLive: boolean;
    setUseDatabaseForLive: React.Dispatch<React.SetStateAction<boolean>>;
    useWebSearchForLive: boolean;
    setUseWebSearchForLive: React.Dispatch<React.SetStateAction<boolean>>;
    useKnowledgeForLive: boolean;
    setUseKnowledgeForLive: React.Dispatch<React.SetStateAction<boolean>>;
}

const SimpleUserView: React.FC<SimpleUserViewProps> = ({
    handleFunctionCall,
    handleError,
    handleSuccess,
    conversationFeedback,
    addConversationFeedback,
    database,
    customInstructions,
    replacementMap,
    knowledgeBase,
    userStyleProfile,
    handleAnalyzeConversation,
    loadingStates,
    setLoading,
    isLiveSessionActive,
    toggleLiveSession,
    liveTranscript,
    useDatabaseForLive,
    setUseDatabaseForLive,
    useWebSearchForLive,
    setUseWebSearchForLive,
    useKnowledgeForLive,
    setUseKnowledgeForLive,
}) => (
    <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1 flex flex-col min-h-[32rem]">
            <ChatTab
                variant="simple"
                handleFunctionCall={handleFunctionCall}
                handleError={handleError}
                conversationFeedback={conversationFeedback}
                addConversationFeedback={addConversationFeedback}
                database={database}
                customInstructions={customInstructions}
                replacementMap={replacementMap}
                knowledgeBase={knowledgeBase}
                userStyleProfile={userStyleProfile}
                handleAnalyzeConversation={handleAnalyzeConversation}
                loadingStates={loadingStates}
            />
        </div>
        <div className="flex-1">
            <TestingTab
                variant="simple"
                database={database}
                setLoading={setLoading}
                loadingStates={loadingStates}
                handleError={handleError}
                handleSuccess={handleSuccess}
                isLiveSessionActive={isLiveSessionActive}
                toggleLiveSession={toggleLiveSession}
                liveTranscript={liveTranscript}
                useDatabaseForLive={useDatabaseForLive}
                setUseDatabaseForLive={setUseDatabaseForLive}
                useWebSearchForLive={useWebSearchForLive}
                setUseWebSearchForLive={setUseWebSearchForLive}
                customInstructions={customInstructions}
                knowledgeBase={knowledgeBase}
                useKnowledgeForLive={useKnowledgeForLive}
                setUseKnowledgeForLive={setUseKnowledgeForLive}
                userStyleProfile={userStyleProfile}
            />
        </div>
    </div>
);

export default SimpleUserView;

