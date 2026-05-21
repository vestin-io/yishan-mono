package agentcmd

type opencodeBuilder struct{}

func (b opencodeBuilder) Binary() string { return "opencode" }

func (b opencodeBuilder) Args(prompt, model string) []string {
	args := []string{"run", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
