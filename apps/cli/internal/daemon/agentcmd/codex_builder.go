package agentcmd

type codexBuilder struct{}

func (b codexBuilder) Binary() string { return "codex" }

func (b codexBuilder) Args(prompt, model string) []string {
	args := []string{"exec", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
