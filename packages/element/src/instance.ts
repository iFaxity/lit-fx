import { ShadyRenderOptions, render, TemplateResult } from 'lit-html/lib/shady-render';
import { isFunction, mapObject, camelToKebab, HookTypes, warn, exception } from './shared';
import { Fx, TriggerOpTypes } from './fx';
import { toReactive } from './reactive';
import * as Queue from './queue';
import { supportsAdoptingStyleSheets, CSSResult, shimAdoptedStyleSheets } from './css';
import {
  Props,
  PropsData,
  ResolvePropTypes,
  NormalizedProps,
  validateProp,
  normalizeProps,
  propDefaults,
} from './props';

export let activeInstance: FxInstance = null;
export const elementInstances = new WeakMap<FxElement, FxInstance>();

interface FxModel {
  prop?: string;
  event?: string;
}

export interface FxOptions<P = Props, T = ResolvePropTypes<P>> {
  name: string;
  closed?: boolean;
  props?: P;
  model?: FxModel;
  setup(this: void, props: T, ctx: FxContext): () => TemplateResult;
  styles?: CSSResult|CSSResult[];
}

interface NormalizedFxOptions extends Required<FxOptions> {
  tag: string;
  props: NormalizedProps;
  attrs: Record<string, string>;
  styles: CSSResult[];
}

class FxContext {
  readonly el: FxElement;
  readonly model: FxModel;
  readonly attrs: Record<string, string>;
  readonly props: NormalizedProps;

  /**
   * Instansiates a new setup context for a FxElement
   * @param {FxElement} el Element to relate context to
   * @param {NormalizedFxOptions} options Normalized element options
   */
  constructor(el: FxElement, options: NormalizedFxOptions) {
    this.el = el;
    this.model = options.model;
    this.attrs = options.attrs;
    this.props = options.props;
  }

  /**
   * Dispatches an event from the host element
   * @param {string} eventName Event to emit
   * @param {*} detail Custom event value
   * @returns {void}
   */
  emit(eventName: string, detail?: any): void {
    let e = typeof detail != 'undefined'
      ? new CustomEvent(eventName, { detail })
      : new Event(eventName);

    this.el.dispatchEvent(e);
  }
}

class FxInstance {
  readonly el: FxElement;
  readonly options: NormalizedFxOptions;
  readonly ctx: FxContext;
  readonly hooks: Record<string, Set<Function>>;
  readonly renderOptions: ShadyRenderOptions;
  readonly fx: Fx;
  readonly props: PropsData;
  readonly shadowRoot: ShadowRoot;
  private renderTemplate: () => TemplateResult;
  private rendering: boolean = false;
  private mounted: boolean = false;
  private shimAdoptedStyleSheets: boolean = false;

  /**
   * Constructs a new element instance, holds all the functionality to avoid polluting element
   * @param {FxElement} el Element to create instance from
   * @param {NormalizedFxOptions} options Normalized element options
   */
  constructor(el: FxElement, options: NormalizedFxOptions) {
    activeInstance = this;
    elementInstances.set(el, this);

    this.el = el;
    this.options = options;
    this.ctx = new FxContext(el, options);
    this.hooks = {};
    this.renderOptions = { scopeName: options.tag, eventContext: el };
    this.fx = new Fx(this.update.bind(this), {
      lazy: true,
      computed: false,
      scheduler: this.scheduleUpdate.bind(this),
    });
    this.props = propDefaults(options.props);
    this.shadowRoot = el.attachShadow({ mode: options.closed ? 'closed' : 'open' });
    this.setup();
  }

  /**
   * Runs the setup function to collect dependencies and hold logic
   * @returns {void}
   */
  setup(): void {
    const { props, ctx, options } = this;

    // Create a proxy for the props
    const propsProxy = new Proxy(props, {
      get(_, key: string) {
        Fx.track(props, key);
        return props[key];
      },
      set(_, key: string, value: unknown) {
        props[key] = value;
        Fx.trigger(props, TriggerOpTypes.SET, key);
        ctx.emit(`fxsync:${key}`);
        if (key == ctx.model.prop) {
          ctx.emit(ctx.model.event);
        }
        return true;
      },
      deleteProperty() {
        exception('Props are not deletable', options.name);
      },
    });

    // Run setup function to gather reactive data
    // Pause tracking while calling setup function
    Fx.pauseTracking();
    this.renderTemplate = options.setup.call(undefined, propsProxy, ctx);
    Fx.resetTracking();
    activeInstance = null;

    if (!isFunction(this.renderTemplate)) {
      exception('Setup must return a function that returns a TemplateResult', `${options.name}#setup`);
    }

    // Shim styles for shadow root, if needed
    if (window.ShadowRoot && this.shadowRoot instanceof window.ShadowRoot) {
      const { tag, styles } = options;
      this.shimAdoptedStyleSheets = shimAdoptedStyleSheets(tag, styles);
    }
  }


  /**
   * Runs all the specified hooks on the Fx instance
   * @param {string} hook Specified hook name
   * @returns {void}
   */
  runHooks(hook: string): void {
    const hooks = this.hooks[hook];

    if (hooks?.size) {
      hooks.forEach(fn => {
        Fx.pauseTracking();
        isFunction(fn) && fn.call(undefined);
        Fx.resetTracking();
      });
    }
  }


  /**
   * Schedules a run to render updated content
   * @param {Function} run Runner function
   * @returns {void}
   */
  scheduleUpdate(run: () => void): void {
    // Prevent overlapping renders
    if (this.rendering) return;
    this.rendering = true;

    // Queue the render
    Queue.push(() => {
      if (!this.mounted) {
        run.call(this.fx);
        this.mounted = true;
      } else {
        this.runHooks(HookTypes.BEFORE_UPDATE);
        run.call(this.fx);
        this.runHooks(HookTypes.UPDATE);
      }

      this.rendering = false;
    });
  }


  /**
   * Renders shadow root content
   * @returns {void}
   */
  update(): void {
    const { shadowRoot, options } = this;
    const result = this.renderTemplate();

    if (!(result instanceof TemplateResult)) {
      exception('Setup must return a function that returns a TemplateResult', `${options.name}#setup`);
    }

    render(result, shadowRoot, this.renderOptions);

    if (this.shimAdoptedStyleSheets) {
      options.styles.forEach(style => shadowRoot.appendChild(style.createElement()));
      this.shimAdoptedStyleSheets = false;
    }
  }
}

// HTMLElement needs es6 classes to instansiate properly
export class FxElement extends HTMLElement {
  static get is(): string { return ''; }

  /**
   * Constructs a new FxElement
   * @param {NormalizedFxOptions} options Normalized element options
   */
  constructor(options: NormalizedFxOptions) {
    super();
    const instance = new FxInstance(this, options);

    // Set props on the element
    const { props, name } = instance.options;
    const propsData = instance.props;

    // Set props as getters/setters on element
    // props should be a readonly reactive object
    for (let key of Object.keys(props)) {
      // If prop already exists, then we throw error
      if (this.hasOwnProperty(key)) {
        exception(`Prop ${key} is reserved, please use another.`, name);
      }

      // Validate props default value
      validateProp(props, key, propsData[key]);

      Object.defineProperty(this, key, {
        get: () => {
          Fx.track(propsData, key);
          return propsData[key];
        },
        set: (newValue) => {
          if (newValue !== propsData[key]) {
            // Trigger an update on the element
            propsData[key] = toReactive(validateProp(props, key, newValue));
            Fx.trigger(propsData, TriggerOpTypes.SET, key);
          }
        },
      });
    }

    // Queue the render
    instance.fx.scheduleRun();
  }

  /**
   * Runs when mounted to the DOM
   * @returns {void}
   */
  connectedCallback() {
    const instance = elementInstances.get(this);
    instance.runHooks(HookTypes.BEFORE_MOUNT);
    window.ShadyCSS?.styleElement(this);
    instance.runHooks(HookTypes.MOUNT);
  }

  /**
   * Runs when unmounted from DOM
   * @returns {void}
   */
  disconnectedCallback() {
    const instance = elementInstances.get(this);
    instance.runHooks(HookTypes.BEFORE_UNMOUNT);
    instance.runHooks(HookTypes.UNMOUNT);
  }

  /**
   * Observes attribute changes, triggers updates on props
   * @returns {void}
   */
  attributeChangedCallback(attr: string, oldValue: string, newValue: string) {
    // newValue & oldValue null if not set, string if set, default to empty string
    if (oldValue !== newValue) {
      const instance = elementInstances.get(this);
      const { attrs } = instance.options;
      const key = attrs[attr];

      this[key] = newValue;
    }
  }
}

/**
 * Collects an array of CSSResults into a Set of CSSResults to ensure they are unique
 * @param {CSSResult[]} styles Stylesheets to collect
 * @param {Set} set Set to hold all stylesheets
 * @returns {Set}
 */
function collectStyles(styles: CSSResult[], set?: Set<CSSResult>): Set<CSSResult> {
  set = set ?? new Set<CSSResult>();
  return styles.reduceRight((set, s) => Array.isArray(s) ? collectStyles(s, set) : (set.add(s), set), set);
}

/**
 * Normalizes the raw options object to a more predictable format
 * @param {FxOptions} options Raw element options
 * @returns {NormalizedFxOptions}
 */
function normalizeOptions<T>(options: FxOptions<T>): NormalizedFxOptions {
  const { setup, model, styles } = options;
  const props = options.props ?? {};
  let css: CSSResult[] = [];

  if (styles) {
    if (Array.isArray(styles)) {
      css = [ ...collectStyles(styles) ];
    } else {
      css.push(styles);
    }
  }

  return {
    name: options.name,
    tag: camelToKebab(options.name),
    closed: options.closed ?? false,
    props: options.props ? normalizeProps(props) : props,
    attrs: mapObject((key) => [ camelToKebab(key), key ], props),
    model: {
      prop: model?.prop ?? 'value',
      event: model?.event ?? 'input',
    },
    setup: setup ?? null,
    styles: css,
  } as NormalizedFxOptions;
}

/**
 * Defines a new custom shlim element
 * @param {FxOptions} options - Raw element options
 * @returns {FxElement}
 */
export function defineElement<T extends Readonly<Props>>(options: FxOptions<T>): typeof FxElement {
  const normalized = normalizeOptions(options);
  const attrs = Object.keys(normalized.attrs);

  if (!normalized.tag.includes('-')) {
    warn('Element names should include a hyphen (-) or be camelised with at least 2 upper-case characters', options.name);
  }

  const CustomElement = class extends FxElement {
    static get is() {
      return normalized.tag;
    }

    static get observedAttributes() {
      return attrs;
    }

    constructor() {
      super(normalized);
    }
  };

  window.customElements.define(normalized.tag, CustomElement);
  return CustomElement;
}
