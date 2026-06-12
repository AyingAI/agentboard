import { useEffect, useState } from 'react';
import type { BoardDSL, ValidationError } from '../types/dsl';
import { validateBoard } from '../engine/validation';

/** Thin hook: just validates the board on every change. Storage is handled by useBoardSessions. */
export function useBoardState(board: BoardDSL) {
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(() => validateBoard(board));

  useEffect(() => {
    setValidationErrors(validateBoard(board));
  }, [board]);

  return { validationErrors };
}
