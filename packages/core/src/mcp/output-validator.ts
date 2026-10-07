import { Ajv, type ValidateFunction } from 'ajv';
import type { ToolOutputSchema } from './contract.js';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = new WeakMap<ToolOutputSchema, ValidateFunction>();

export class CoreOutputError extends Error {
  readonly code = 'OUTPUT_SCHEMA_MISMATCH';
  constructor(toolName: string, readonly paths: string[]) {
    super(`${toolName} 输出不符合公开契约: ${paths.join('; ')}`);
    this.name = 'CoreOutputError';
  }
}

export function validateOutput(toolName: string, value: unknown, schema: ToolOutputSchema): void {
  let validator = validators.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    validators.set(schema, validator);
  }
  // Validate the JSON wire representation: undefined fields are intentionally omitted by serialization.
  if (!validator(JSON.parse(JSON.stringify(value)))) {
    throw new CoreOutputError(toolName, (validator.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`));
  }
}
