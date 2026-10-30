import { registerRoot } from 'remotion';
import { makeRoot } from '../_kit/root';
import { ConceptBotImpl } from './Bot';

registerRoot(makeRoot(ConceptBotImpl));
