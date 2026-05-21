package agentcmd

type cursorBuilder struct{}

func (b cursorBuilder) Binary() string { return "cursor" }

func (b cursorBuilder) Args(prompt, model string) []string {
	args := []string{"run", "--prompt", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
