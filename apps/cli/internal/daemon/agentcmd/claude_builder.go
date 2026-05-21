package agentcmd

type claudeBuilder struct{}

func (b claudeBuilder) Binary() string { return "claude" }

func (b claudeBuilder) Args(prompt, model string) []string {
	args := []string{"-p", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
