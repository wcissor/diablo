import { registerRoot } from 'remotion';
import { makeRoot } from './kit/root';
import { ConceptBotImpl } from './Bot';

registerRoot(makeRoot(ConceptBotImpl));
