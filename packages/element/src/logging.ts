import { isString } from '@kirei/shared';
import { KireiInstance } from './instance';

// Constants for stack trace
const INDENT_STEP = 2;
const INDENT = 4;

class KireiError extends Error {
  type: string;
  context?: string;

  constructor(message: string, type: string, context?: string) {
    super();
    const instance = KireiInstance.active;

    if (isString(context)) {
      if (message.endsWith('.')) {
        message = message.slice(0, -1);
      }

      message += ` in #${context}.`;
      this.context = context;
    }

    if (instance) {
      message += this.createStackTrace(instance);
    }

    this.type = type;
    this.message = message;
    this.name = `[Kirei ${type}]`;
    Error.captureStackTrace(this, KireiError);
  }

  /**
   * Creates an iterator to walk the instance tree
   * @param {KireiInstance} instance Instance to walk up from
   * @returns {Generator}
   */
  private *walkInstanceTree(instance: KireiInstance): Generator<KireiInstance> {
    while (instance) {
      yield instance;
      instance = instance.parent;
    }
  }

  /**
   * Formats element name from an instance
   */
  private formatElementName(instance: KireiInstance, indent: number, recursiveCount?: number): string {
    const { name, filename } = instance.options;
    let res = `${indent ? ' '.repeat(INDENT + INDENT_STEP * indent) : '--> '}<${name}>`;

    if (filename) {
      res += ` at ${filename}`;
    }
    if (recursiveCount) {
      res += `... (${recursiveCount} recursive calls)`;
    }
    return res;
  }

  /**
   * Creates a stack trace for error/warning messages
   * @param {KireiInstance} instance Instance where stack trace should start
   * @returns {string}
   */
  private createStackTrace(instance: KireiInstance): string {
    if (!instance.parent) {
      return `\n\n(found in <${instance.options.name}>)`;
    }
    const tree = [];
    let recursionCount = 0;

    for (let node of this.walkInstanceTree(instance)) {
      if (tree.length) {
        const prev = tree[tree.length - 1];
        if (prev.constructor === node.constructor) {
          recursionCount++;
          continue;
        } else if (recursionCount) {
          tree[tree.length - 1] = [prev, recursionCount];
          recursionCount = 0;
        }
      }

      tree.push(instance);
    }

    return `\n\nfound in:\n\n` + tree.map((res, idx) => {
      return Array.isArray(res)
        ? this.formatElementName(res[0], idx, res[1])
        : this.formatElementName(res, idx);
    }).join('\n');
  }
}

/**
 * Throws an exception with a formatted message
 * @param {string|Error} message Exception message
 * @param {string} context Optional context (instance name, function name)
 * @returns {void}
 */
export function exception(message: string | Error, context?: string): never {
  throw new KireiError(message.toString(), 'error', context);
}

/**
 * Logs an error message in the console
 * @param {string|Error} message Exception message
 * @param {string} context Optional context (instance name, function name)
 * @returns {void}
 */
export function error(message: string | Error, context?: string): void {
  console.error(new KireiError(message.toString(), 'error', context));
}

/**
 * Logs a warning message in the console
 * @param {string|Error} message Warning message
 * @param {string} context Optional context (instance name, function name)
 * @returns {void}
 */
export function warn(message: string | Error, context?: string): void {
  console.warn(new KireiError(message.toString(), 'warn', context));
}