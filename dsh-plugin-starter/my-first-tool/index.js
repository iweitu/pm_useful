/**
 * A DSH Host plugin.
 *
 * The only required export is `apply(ctx, config)`. Registries such as
 * `ctx.tools` are effect-scoped: `ctx.tools.register(...)` returns the exact
 * disposer and also attaches itself to this plugin's fiber, so Cordis tears the
 * tool down on reload/unload without a manual cleanup wrapper.
 */

/** Declaring `Config` makes DSH validate this row's `config` before activating. */
export const Config = {
  greeting: { type: 'string', default: 'hello' },
};

/**
 * `inject` names the services this plugin needs. DSH delays activation until
 * `ctx.tools` exists, and re-applies if that service is replaced.
 */
export const inject = ['tools'];

export function apply(ctx, config) {
  ctx.tools.register({
    name: 'hello_tool',
    description:
      'Return a greeting. Use this to check that the my-first-tool plugin is live.',
    parameters: {
      who: {
        type: 'string',
        required: true,
        description: 'Who should be greeted.',
      },
    },
    output: {
      // `schema` is the canonical JSON value this tool returns; `render` is what
      // the model actually reads as the tool result.
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // `exec.signal` is the caller's cooperative cancellation signal. Long
      // operations should observe it.
      if (exec?.signal?.aborted) throw new Error('aborted');
      return `${config.greeting}, ${args.who}! (from @local/my-first-tool)`;
    },
  });
}
