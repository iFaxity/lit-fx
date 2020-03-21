import udomdiff from 'udomdiff';
import {diffable} from './shared';

const directives = new Map<string, (dir: Directive) => DirectiveFactory>();
const shorthands = new Map<string, string>();

// implement local directives?
type Parser = (newValue: any) => void;

interface Directive {
  name: string;
  el: Element;
  arg: string;
  mods: string[];
}

type DirectiveFactory = (newValue: unknown) => void;


// this helper avoid code bloat around handleAnything() callback
function diff(node, oldNodes, newNodes) {
  // TODO: there is a possible edge case where a node has been
  //       removed manually, or it was a keyed one, attached
  //       to a shared reference between renders.
  //       In this case udomdiff might fail at removing such node
  //       as its parent won't be the expected one.
  //       The best way to avoid this issue is to filter oldNodes
  //       in search of those not live, or not in the current parent
  //       anymore, but this would require both a change to uwire,
  //       exposing a parentNode from the firstChild, as example,
  //       but also a filter per each diff that should exclude nodes
  //       that are not in there, penalizing performance quite a lot.
  //       As this has been also a potential issue with domdiff,
  //       and both lighterhtml and hyperHTML might fail with this
  //       very specific edge case, I might as well document this possible
  //       "diffing shenanigan" and call it a day.
  return udomdiff(node.parentNode, oldNodes, newNodes, diffable, node);
}

function execDirective(node: Element, name: string): DirectiveFactory {
  const fn = directives.get(name);

  if (!fn) {
    throw new Error('');
  }

  const directive = {
    el: node,
    name: '',
    arg: '',
    mods: [],
  } as Directive;

  return fn(directive);
}


//ref
//v-bind, .
//v-on, @
//v-if
//v-elif
//v-not
//v-sync, &


function attrParser(node: Element, name: string): DirectiveFactory {
  if (name == 'ref') {}
  else if (name == '') {}


  if (name.startsWith('v-')) {
    return execDirective(node, name.slice(2))
  }

  // Default to attribute binding
  let attr = document.createAttribute(name);
  let noOwner = true;
  let value;

  return (newValue: string) => {
    if (value !== newValue) {
      value = newValue;
      if (value == null) {
        if (!noOwner) {
          node.removeAttributeNode(attr);
          noOwner = true;
        }
      }
      else {
        attr.value = newValue;

        // There is no else case here.
        // If the attribute has no owner, it's set back.
        if (noOwner) {
          node.setAttributeNode(attr);
          noOwner = false;
        }
      }
    }
  };
}

function nodeParser(refNode: Comment): DirectiveFactory {
  let nodes = [];
  let value;
  let text;

  // Clear the contents of the reference node
  refNode.textContent = '';

  const parse = newValue => {
    switch (typeof newValue) {
      // primitives are handled as text content
      case 'string':
      case 'number':
      case 'boolean':
        if (value !== newValue) {
          value = newValue;
          if (!text)
            text = document.createTextNode('');
          text.textContent = newValue;
          nodes = diff(refNode, nodes, [text]);
        }
        break;
      // null, and undefined are used to cleanup previous content
      case 'object':
      case 'undefined':
        if (newValue == null) {
          if (value) {
            value = newValue;
            nodes = diff(refNode, nodes, []);
          }
        }
        // arrays and nodes have a special treatment
        else if (Array.isArray(newValue)) {
          value = newValue;
          // arrays can be used to cleanup, if empty
          if (value.length === 0)
            nodes = diff(refNode, nodes, []);
          // or diffed, if these contains nodes or "wires"
          else if (typeof value[0] === 'object')
            nodes = diff(refNode, nodes, value);
          // in all other cases the content is stringified as is
          else
            parse('' + value);
        }
        // if the new value is a DOM node, or a wire, and it's
        // different from the one already live, then it's diffed.
        // if the node is a fragment, it's appended once via its childNodes
        // There is no `else` here, meaning if the content
        // is not expected one, nothing happens, as easy as that.
        else if ('ELEMENT_NODE' in newValue && newValue !== value) {
          const newNodes = newValue.nodeType === Node.DOCUMENT_FRAGMENT_NODE
            ? [...newValue.childNodes]
            : [newValue];

          value = newValue;
          nodes = diff(refNode, nodes, newNodes);
        }
      }
  };

  return parse;
}

function textParser(node: Text): DirectiveFactory {
  let value;

  return (newValue: string) => {
    if (value !== newValue) {
      value = newValue;
      node.textContent = newValue == null ? '' : newValue;
    }
  };
}

export function addDirective(key: string, directive: (dir: Directive) => DirectiveFactory): void {
  if (directives.has(key)) {
    throw new Error('directive already exists');
  }

  directives.set(key, directive);
}

