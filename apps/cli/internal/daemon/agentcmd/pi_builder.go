package agentcmd

type piBuilder struct{}

func (b piBuilder) Binary() string { return "pi" }

func (b piBuilder) Args(prompt, model string) []string {
	args := []string{"-p", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
