import { MessageResponse } from '@/components/ai-elements/message';

/** Markdown da resposta em chunk separado: só carrega depois da primeira resposta do Agente. */
export function AssistantMessageContent({ content }: { content: string }) {
  return <MessageResponse className="text-sm leading-relaxed">{content}</MessageResponse>;
}
